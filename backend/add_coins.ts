import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const result = await prisma.user.updateMany({
        data: { coins: 100 }
    });
    console.log(`Updated ${result.count} users to 100 coins.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
