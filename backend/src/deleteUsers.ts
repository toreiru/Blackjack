import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const adminUsername = 'vonToreiru';

    // Find the admin user to keep
    const adminUser = await prisma.user.findUnique({ where: { username: adminUsername } });

    if (!adminUser) {
        console.error(`Admin user ${adminUsername} not found. Aborting deletion to prevent deleting the only admin.`);
        return;
    }

    try {
        // Delete related transactions first to avoid foreign key constraints
        const deletedTransactions = await prisma.transaction.deleteMany({
            where: {
                NOT: {
                    AND: [
                        { senderId: adminUser.id },
                        { receiverId: adminUser.id }
                    ]
                }
            }
        });
        console.log(`Deleted ${deletedTransactions.count} transactions related to non-admin users.`);

        // Delete all users except the admin
        const deletedUsers = await prisma.user.deleteMany({
            where: {
                NOT: {
                    username: adminUsername
                }
            }
        });
        console.log(`Deleted ${deletedUsers.count} non-admin users.`);
    } catch (error) {
        console.error('Error deleting users:', error);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
