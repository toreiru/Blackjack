import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
    const username = 'vonToreiru';
    const password = 'Molin@gt27!';

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { username } });

    if (existing) {
        // Update to admin
        await prisma.user.update({
            where: { id: existing.id },
            data: { role: 'ADMIN', password: hashedPassword }
        });
        console.log(`User ${username} updated to ADMIN role.`);
    } else {
        // Create new admin
        await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                role: 'ADMIN',
                coins: 1000000, // Give some starter coins
                referralCode
            }
        });
        console.log(`User ${username} CREATED as ADMIN.`);
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
