import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();

  const userCount = await prisma.adminUser.count();

  if (userCount === 0) {
    if (!adminEmail || !adminPassword) {
      console.warn("Skipping admin seed because ADMIN_EMAIL or ADMIN_PASSWORD is not set.");
      return;
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const createdAdmin = await prisma.adminUser.create({
      data: {
        firstName: "Admin",
        lastName: null,
        username: "admin",
        email: adminEmail,
        passwordHash,
        role: "ADMIN",
        displayName: "Admin",
      },
    });

    console.log("Initial admin created from env");
    await prisma.auditLog.create({
      data: {
        actorAdminUserId: createdAdmin.id,
        action: "INITIAL_ADMIN_CREATED_FROM_ENV",
        targetType: "AdminUser",
        targetId: createdAdmin.id,
        metadata: {
          email: createdAdmin.email,
        },
      },
    });
  } else {
    console.log("Users already exist; skipping env admin bootstrap");
    await prisma.auditLog.create({
      data: {
        action: "ENV_ADMIN_BOOTSTRAP_SKIPPED",
        targetType: "AdminUser",
        metadata: {
          userCount,
        },
      },
    });
  }

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
