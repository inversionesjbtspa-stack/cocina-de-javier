const baseUrl = process.env.APP_BASE_URL;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!baseUrl || !email || !password) {
  console.error("APP_BASE_URL, ADMIN_EMAIL and ADMIN_PASSWORD are required.");
  process.exit(1);
}

function collectSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const cookie = headers.get("set-cookie");
  return cookie ? [cookie] : [];
}

function cookieHeader(cookies) {
  return cookies
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

const cookies = [];
const loginResponse = await fetch(`${baseUrl}/login`, {
  redirect: "manual"
});
cookies.push(...collectSetCookies(loginResponse.headers));

const loginHtml = await loginResponse.text();
const actionMatch = loginHtml.match(/name="(\$ACTION_ID_[^"]+)"/);

if (!actionMatch) {
  throw new Error("Login server action id was not found.");
}

const formData = new FormData();
formData.append(actionMatch[1], "");
formData.append("email", email);
formData.append("password", password);

const postResponse = await fetch(`${baseUrl}/login`, {
  method: "POST",
  body: formData,
  redirect: "manual",
  headers: {
    cookie: cookieHeader(cookies)
  }
});
cookies.push(...collectSetCookies(postResponse.headers));

if (![303, 307].includes(postResponse.status)) {
  const body = await postResponse.text();
  throw new Error(`Login form failed with status ${postResponse.status}: ${body.slice(0, 160)}`);
}

const appResponse = await fetch(`${baseUrl}/`, {
  redirect: "manual",
  headers: {
    cookie: cookieHeader(cookies)
  }
});

const appHtml = await appResponse.text();

if (appResponse.status !== 200 || !appHtml.includes("Dashboard ejecutivo")) {
  throw new Error(`Authenticated dashboard failed with status ${appResponse.status}.`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      loginStatus: postResponse.status,
      dashboardStatus: appResponse.status,
      sessionCookies: cookies.length
    },
    null,
    2
  )
);
