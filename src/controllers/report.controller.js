const reportService = require('../services/report.service');

const submitReport = async (req, reply) => {
  try {
    const report = await reportService.createReport(req.user.id, req.body);
    reply.code(201).send(report);
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

// Admin Only
const getAllReports = async (req, reply) => {
  try {
    const reports = await reportService.getReports(req.query);
    reply.send(reports);
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

const updateReport = async (req, reply) => {
  try {
    const { status, resolutionNotes, action } = req.body;
    const report = await reportService.resolveReport(req.params.id, req.user.id, {
      status, resolutionNotes, action
    });
    reply.send(report);
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

module.exports = {
  submitReport,
  getAllReports,
  updateReport
};
