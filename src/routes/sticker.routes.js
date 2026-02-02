const stickerController = require('../controllers/sticker.controller');
const { protect, admin } = require('../middlewares/auth.middleware');

const stickerRoutes = async (app) => {
    // Public: Get all stickers
    app.get('/', {
        preHandler: [protect]
    }, stickerController.getAllStickers);

    // Admin: Create sticker
    app.post('/', {
        preHandler: [protect, admin]
    }, stickerController.createSticker);

    // Admin: Delete sticker
    app.delete('/:id', {
        preHandler: [protect, admin]
    }, stickerController.deleteSticker);
};

module.exports = stickerRoutes;
