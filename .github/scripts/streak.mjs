import { readFile, writeFile } from "node:fs/promises";

const LOGIN = process.env.GH_LOGIN;
const TOKEN = process.env.GITHUB_TOKEN;
const SVG_PATH = "assets/statistics.svg";

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "streak-updater",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function getCreatedYear() {
  const data = await gql(
    `query ($login: String!) { user(login: $login) { createdAt } }`,
    { login: LOGIN }
  );
  return new Date(data.user.createdAt).getUTCFullYear();
}

async function getContributionDays() {
  const days = new Map();
  const startYear = await getCreatedYear();
  const endYear = new Date().getUTCFullYear();

  // The API only allows one-year windows, so fetch each year separately.
  for (let year = startYear; year <= endYear; year++) {
    const data = await gql(
      `query ($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            contributionCalendar {
              weeks { contributionDays { date contributionCount } }
            }
          }
        }
      }`,
      {
        login: LOGIN,
        from: `${year}-01-01T00:00:00Z`,
        to: `${year}-12-31T23:59:59Z`,
      }
    );
    const weeks =
      data.user.contributionsCollection.contributionCalendar.weeks;
    for (const week of weeks) {
      for (const day of week.contributionDays) {
        days.set(day.date, day.contributionCount);
      }
    }
  }
  return days;
}

function currentStreak(days) {
  const today = new Date().toISOString().slice(0, 10);
  const cursor = new Date(`${today}T00:00:00Z`);

  // If you haven't contributed yet today, the streak still counts from yesterday.
  if ((days.get(today) ?? 0) === 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;
  while ((days.get(cursor.toISOString().slice(0, 10)) ?? 0) > 0) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

const days = await getContributionDays();
const streak = currentStreak(days);
console.log(`Current streak: ${streak} days`);

const svg = await readFile(SVG_PATH, "utf8");
const updated = svg.replace(
  /(<text class="hero"[^>]*>)[^<]*(<\/text>)/,
  `$1${streak}$2`
);
await writeFile(SVG_PATH, updated);