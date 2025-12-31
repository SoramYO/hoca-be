const Report = require('../models/Report');
const User = require('../models/User');

const createReport = async (submitterId, data) => {
  return await Report.create({
    submitter: submitterId,
    ...data
  });
};

const getReports = async (query = {}) => {
  return await Report.find(query)
    .populate('submitter', 'displayName email')
    .populate('targetUser', 'displayName email avatar')
    .populate('room', 'name')
    .sort('-createdAt');
};

const resolveReport = async (reportId, adminId, { status, resolutionNotes, action }) => {
  const report = await Report.findById(reportId);
  if (!report) throw new Error('Report not found');

  report.status = status;
  report.resolutionNotes = resolutionNotes;
  report.resolvedBy = adminId;
  report.resolvedAt = new Date();
  await report.save();

  if (action === 'BLOCK_USER') {
    await User.findByIdAndUpdate(report.targetUser, { isBlocked: true });
  } else if (action === 'WARN_USER') {
    // Add warning logic here if needed
    const user = await User.findById(report.targetUser);
    user.warnings.push({
      reason: resolutionNotes || 'Violated community standards',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });
    await user.save();
  }

  return report;
};

module.exports = {
  createReport,
  getReports,
  resolveReport
};
