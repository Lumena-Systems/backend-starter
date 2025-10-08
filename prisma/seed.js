"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const productNames = [
    'Wireless Bluetooth Headphones', 'USB-C Charging Cable', 'Laptop Stand',
    'Mechanical Keyboard', 'Wireless Mouse', 'Monitor Stand', '4K Webcam',
    'External SSD 1TB', 'Phone Case', 'Screen Protector', 'Laptop Backpack',
    'Desk Lamp', 'Ergonomic Chair', 'Standing Desk', 'Cable Management Box',
    'Power Strip', 'Microphone', 'Ring Light', 'Tripod', 'Graphics Tablet',
    'Wireless Earbuds', 'Portable Charger', 'HDMI Cable', 'USB Hub',
    'Docking Station', 'Laptop Sleeve', 'Mouse Pad', 'Wrist Rest',
    'Monitor Arm', 'Desk Organizer', 'Notebook', 'Pen Set', 'Whiteboard',
    'Phone Holder', 'Tablet Stand', 'Smart Watch', 'Fitness Tracker',
    'Water Bottle', 'Coffee Mug', 'Desk Plant', 'Picture Frame',
    'Bookshelf', 'File Cabinet', 'Printer', 'Scanner', 'Shredder',
    'Stapler', 'Paper Clips', 'Sticky Notes', 'Highlighters',
    'Gaming Mouse', 'Gaming Keyboard', 'Gaming Headset', 'Gaming Chair',
    'Controller', 'VR Headset', 'Smart Speaker', 'Smart Bulb',
    'Security Camera', 'Door Bell', 'Smart Lock', 'Air Purifier',
    'Humidifier', 'Fan', 'Heater', 'Blanket', 'Pillow', 'Yoga Mat',
    'Dumbbells', 'Resistance Bands', 'Jump Rope', 'Foam Roller',
    'Protein Shaker', 'Gym Bag', 'Running Shoes', 'Sports Watch',
    'Sunglasses', 'Hat', 'Backpack', 'Travel Mug', 'Lunch Box',
    'Cutting Board', 'Knife Set', 'Blender', 'Toaster', 'Coffee Maker',
    'Air Fryer', 'Instant Pot', 'Mixer', 'Food Scale', 'Measuring Cups',
    'Cookware Set', 'Baking Sheet', 'Cake Pan', 'Muffin Tin', 'Rolling Pin',
    'Can Opener', 'Bottle Opener', 'Wine Glasses', 'Beer Glasses', 'Shot Glasses'
];
async function main() {
    console.log('Starting seed...');
    // Clean existing data
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();
    // Create products (with some having null descriptions for Bug 5)
    console.log('Creating products...');
    const products = [];
    for (let i = 0; i < 100; i++) {
        const product = await prisma.product.create({
            data: {
                name: productNames[i % productNames.length] + (i >= productNames.length ? ` ${Math.floor(i / productNames.length) + 1}` : ''),
                // 20% of products have null descriptions for Bug 5 testing
                description: Math.random() > 0.2
                    ? `High quality ${productNames[i % productNames.length].toLowerCase()}. Perfect for everyday use.`
                    : null,
                price: Math.floor(Math.random() * 495) + 5, // $5 to $500
                // Some products with low inventory for Bug 4 (race condition testing)
                inventory: i < 10 ? Math.floor(Math.random() * 3) + 1 : Math.floor(Math.random() * 100) + 10,
            },
        });
        products.push(product);
    }
    console.log(`Created ${products.length} products`);
    // Create users
    console.log('Creating users...');
    const users = [];
    for (let i = 0; i < 30; i++) {
        const user = await prisma.user.create({
            data: {
                email: `user${i + 1}@example.com`,
                name: `User ${i + 1}`,
            },
        });
        users.push(user);
    }
    console.log(`Created ${users.length} users`);
    // Create orders with items
    console.log('Creating orders...');
    let orderCount = 0;
    for (let i = 0; i < 200; i++) {
        const user = users[Math.floor(Math.random() * users.length)];
        const numItems = Math.floor(Math.random() * 5) + 1; // 1-5 items per order
        const orderItems = [];
        let total = 0;
        for (let j = 0; j < numItems; j++) {
            const product = products[Math.floor(Math.random() * products.length)];
            const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 quantity
            const itemTotal = Number(product.price) * quantity;
            total += itemTotal;
            orderItems.push({
                productId: product.id,
                quantity,
                price: product.price,
            });
        }
        await prisma.order.create({
            data: {
                userId: user.id,
                status: ['pending', 'completed', 'cancelled'][Math.floor(Math.random() * 3)],
                total,
                items: {
                    create: orderItems,
                },
            },
        });
        orderCount++;
    }
    console.log(`Created ${orderCount} orders`);
    // Create one user with 100+ orders for Bug 1 (N+1 query) testing
    console.log('Creating high-volume user for N+1 testing...');
    const testUser = await prisma.user.create({
        data: {
            email: 'heavy.user@example.com',
            name: 'Heavy User',
        },
    });
    for (let i = 0; i < 120; i++) {
        const numItems = Math.floor(Math.random() * 4) + 2; // 2-5 items
        const orderItems = [];
        let total = 0;
        for (let j = 0; j < numItems; j++) {
            const product = products[Math.floor(Math.random() * products.length)];
            const quantity = Math.floor(Math.random() * 2) + 1;
            const itemTotal = Number(product.price) * quantity;
            total += itemTotal;
            orderItems.push({
                productId: product.id,
                quantity,
                price: product.price,
            });
        }
        await prisma.order.create({
            data: {
                userId: testUser.id,
                status: 'completed',
                total,
                items: {
                    create: orderItems,
                },
            },
        });
    }
    console.log(`Created 120 orders for test user (${testUser.email})`);
    console.log('Seed completed!');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
