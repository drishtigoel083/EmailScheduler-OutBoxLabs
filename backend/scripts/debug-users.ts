import { prisma } from '../src/db/prisma.js';

async function main() {
  const users = await prisma.user.findMany({
    include: {
      slackToken: true,
      _count: { select: { emails: true } },
    },
  });
  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
