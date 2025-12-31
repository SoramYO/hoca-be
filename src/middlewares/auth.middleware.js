const protect = async (req, reply) => {
  try {
    await req.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
};

const admin = async (req, reply) => {
    console.log("123123123",req.user)
  if (req.user && req.user.role === 'ADMIN') {
    // Authorized
  } else {
    reply.code(403).send({ message: 'Not authorized as admin' });
  }
};

module.exports = {
  protect,
  admin
};
