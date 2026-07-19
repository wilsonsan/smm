const baseUrl = (
  process.argv[2] ||
  process.env.LEGAL_BASE_URL ||
  "http://127.0.0.1:3196"
).replace(/\/+$/, "");

const routes = [
  {
    path: "/privacy",
    heading: "Privacy Policy",
    requiredText: "The Application is an internal business tool used by NC Tile Pros LLC",
  },
  {
    path: "/terms",
    heading: "Terms of Use",
    requiredText: "The Application is an internal business tool intended for use by NC Tile Pros LLC",
  },
  {
    path: "/data-deletion",
    heading: "User Data Deletion Instructions",
    requiredText: "Social Media Manager Data Deletion Request",
  },
] as const;

async function verifyRoute(route: (typeof routes)[number]) {
  const response = await fetch(`${baseUrl}${route.path}`, {
    redirect: "manual",
    headers: {
      "User-Agent": "facebookexternalhit/1.1",
    },
  });
  const html = await response.text();
  const expectedCanonical = `https://smm.nctilepros.com${route.path}`;

  if (response.status !== 200) {
    throw new Error(`${route.path} returned HTTP ${response.status}; expected 200.`);
  }
  if (response.headers.has("location")) {
    throw new Error(`${route.path} returned an unexpected redirect.`);
  }
  if (!html.includes(`<h1>${route.heading}</h1>`)) {
    throw new Error(`${route.path} is missing its expected heading.`);
  }
  if (!html.includes(route.requiredText)) {
    throw new Error(`${route.path} is missing required legal wording.`);
  }
  if (!html.includes(`<link rel="canonical" href="${expectedCanonical}"/>`)) {
    throw new Error(`${route.path} is missing the expected production canonical URL.`);
  }
  if (html.toLowerCase().includes("postiz")) {
    throw new Error(`${route.path} contains an unexpected Postiz reference.`);
  }

  console.log(`PASS ${route.path} (HTTP 200, canonical and content verified)`);
}

async function main() {
  for (const route of routes) {
    await verifyRoute(route);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

export {};
