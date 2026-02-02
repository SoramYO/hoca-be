require('dotenv').config({ path: '../.env' }); // Adjust path if running from scripts/ dir
const mongoose = require('mongoose');
const User = require('../src/models/User'); // Adjust path to models

const activateLegacyUsers = async () => {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find users who are INACTIVE but have NO verification code (Legacy users)
    // Or users who have no accountStatus field (though Mongoose might default it in query, but in DB it might be missing)
    // Actually, for safety, we target INACTIVE + No Code
    
    console.log('Scanning for legacy users...');
    
    // Note: verificationCode is { select: false } in schema, but filter queries work fine.
    // We look for users where:
    // 1. accountStatus is 'INACTIVE' (default for old users when loaded via schema)
    // 2. verificationCode does not exist or is null
    
    const result = await User.updateMany(
      { 
        $or: [
            { accountStatus: 'INACTIVE' },
            { accountStatus: { $exists: false } }
        ],
        $or: [
            { verificationCode: { $exists: false } },
            { verificationCode: null },
            { verificationCode: '' }
        ]
      },
      { 
        $set: { 
            accountStatus: 'ACTIVE',
            verificationCode: undefined,
            verificationCodeExpires: undefined
        } 
      }
    );

    console.log(`Migration complete.`);
    console.log(`Matched count: ${result.matchedCount}`);
    console.log(`Modified count: ${result.modifiedCount}`);

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit();
  }
};

activateLegacyUsers();
