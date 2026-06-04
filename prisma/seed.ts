import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();

  if (!adminEmail || !adminPassword) {
    console.warn("Skipping admin seed because ADMIN_EMAIL or ADMIN_PASSWORD is not set.");
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
      username: "admin",
      role: "ADMIN",
    },
    create: {
      username: "admin",
      email: adminEmail,
      passwordHash,
      role: "ADMIN",
      displayName: "Admin",
    },
  });

  const settings = [
    {
      key: "SITE_NAME",
      value: "Social Media Manager",
    },
    {
      key: "SITE_FAVICON_URL",
      value: "/social-media-favicon.svg",
    },
    {
      key: "PUBLIC_APP_URL",
      value: process.env.APP_URL?.trim() || "http://localhost:3000",
    },
    {
      key: "UPLOAD_DIRECTORY",
      value: process.env.UPLOAD_DIR?.trim() || "./uploads",
    },
    {
      key: "APP_TIMEZONE",
      value: "America/New_York",
    },
    {
      key: "FACEBOOK_APP_ID",
      value: process.env.FACEBOOK_APP_ID?.trim() || "",
    },
  ];

  for (const setting of settings) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
