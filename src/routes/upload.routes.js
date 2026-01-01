const { uploadImage } = require('../services/upload.service');
const { protect } = require('../middlewares/auth.middleware');

const uploadRoutes = async (app) => {
    // Upload avatar
    app.post('/avatar', {
        preHandler: [protect]
    }, async (request, reply) => {
        try {
            const data = await request.file();

            if (!data) {
                return reply.status(400).send({ error: 'No file uploaded' });
            }

            // Validate file type
            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            if (!allowedTypes.includes(data.mimetype)) {
                return reply.status(400).send({ error: 'Invalid file type. Allowed: jpeg, png, webp, gif' });
            }

            // Read file buffer
            const buffer = await data.toBuffer();

            // Upload to Cloudinary
            const result = await uploadImage(buffer, {
                folder: 'avatars',
                publicId: `user_${request.user.id}` // Use user ID as public ID for easy overwrite
            });

            // Update user avatar in database
            const User = require('mongoose').model('User');
            await User.findByIdAndUpdate(request.user.id, { avatar: result.url });

            return {
                success: true,
                url: result.url
            };
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to upload avatar' });
        }
    });

    // General image upload (for admin/badges etc.)
    app.post('/image', {
        preHandler: [protect]
    }, async (request, reply) => {
        try {
            const data = await request.file();

            if (!data) {
                return reply.status(400).send({ error: 'No file uploaded' });
            }

            const buffer = await data.toBuffer();

            // Get folder from query or default to 'uploads'
            const folder = request.query.folder || 'uploads';

            const result = await uploadImage(buffer, { folder });

            return {
                success: true,
                url: result.url,
                publicId: result.publicId
            };
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to upload image' });
        }
    });
};

module.exports = uploadRoutes;
