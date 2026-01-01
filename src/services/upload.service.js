const cloudinary = require('../config/cloudinary');

/**
 * Upload an image buffer to Cloudinary
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {Object} options - Upload options
 * @param {string} options.folder - Cloudinary folder (e.g., 'avatars', 'badges')
 * @param {string} options.publicId - Optional public ID for the image
 * @param {Object} options.transformation - Optional transformations
 * @returns {Promise<{url: string, publicId: string}>}
 */
const uploadImage = async (fileBuffer, options = {}) => {
    const { folder = 'uploads', publicId, transformation } = options;

    return new Promise((resolve, reject) => {
        const uploadOptions = {
            folder,
            resource_type: 'image',
        };

        if (publicId) {
            uploadOptions.public_id = publicId;
            uploadOptions.overwrite = true;
        }

        if (transformation) {
            uploadOptions.transformation = transformation;
        }

        // For avatars, apply default transformations
        if (folder === 'avatars') {
            uploadOptions.transformation = [
                { width: 200, height: 200, crop: 'fill', gravity: 'face' },
                { quality: 'auto', fetch_format: 'auto' }
            ];
        }

        const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({
                        url: result.secure_url,
                        publicId: result.public_id
                    });
                }
            }
        );

        uploadStream.end(fileBuffer);
    });
};

/**
 * Delete an image from Cloudinary
 * @param {string} publicId - The public ID of the image to delete
 * @returns {Promise<void>}
 */
const deleteImage = async (publicId) => {
    await cloudinary.uploader.destroy(publicId);
};

module.exports = {
    uploadImage,
    deleteImage
};
