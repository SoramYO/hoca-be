const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    description: String
}, { timestamps: true });

// Static method to get config value
systemConfigSchema.statics.getValue = async function (key, defaultValue = null) {
    const config = await this.findOne({ key });
    return config ? config.value : defaultValue;
};

// Static method to set config value
systemConfigSchema.statics.setValue = async function (key, value, description = '') {
    return await this.findOneAndUpdate(
        { key },
        { key, value, description },
        { upsert: true, new: true }
    );
};

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
