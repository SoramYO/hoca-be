const Sticker = require('../models/Sticker');
const { uploadImage, deleteImage } = require('../services/upload.service');

const getAllStickers = async (req, reply) => {
    try {
        const stickers = await Sticker.find().sort({ createdAt: -1 });
        reply.send(stickers);
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

const createSticker = async (req, reply) => {
    try {
        const parts = req.parts();
        let name, buffer, mimetype;

        for await (const part of parts) {
            if (part.type === 'file') {
                mimetype = part.mimetype;
                buffer = await part.toBuffer();
            } else {
                // Regular field
                if (part.fieldname === 'name') {
                    name = part.value;
                }
            }
        }

        if (!buffer) {
            return reply.code(400).send({ message: 'No image file uploaded' });
        }
        if (!name) {
            return reply.code(400).send({ message: 'Sticker name is required' });
        }

        // Validate MIME type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(mimetype)) {
            return reply.code(400).send({ message: 'Invalid file type. Allowed: jpeg, png, webp, gif' });
        }

        // Upload to Cloudinary
        const result = await uploadImage(buffer, {
            folder: 'stickers'
        });

        // Save to DB
        const sticker = new Sticker({
            name,
            url: result.url,
            publicId: result.publicId
        });

        await sticker.save();
        reply.code(201).send(sticker);

    } catch (error) {
        req.log.error(error);
        reply.code(500).send({ message: 'Failed to create sticker' });
    }
};

const deleteSticker = async (req, reply) => {
    try {
        const { id } = req.params;
        const sticker = await Sticker.findById(id);

        if (!sticker) {
            return reply.code(404).send({ message: 'Sticker not found' });
        }

        // Delete from Cloudinary
        if (sticker.publicId) {
            await deleteImage(sticker.publicId);
        }

        // Delete from DB
        await Sticker.findByIdAndDelete(id);

        reply.send({ message: 'Sticker deleted successfully' });
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

module.exports = {
    getAllStickers,
    createSticker,
    deleteSticker
};
