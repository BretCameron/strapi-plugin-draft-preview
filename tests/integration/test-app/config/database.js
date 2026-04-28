const { resolve } = require("node:path");

module.exports = () => ({
  connection: {
    client: "sqlite",
    connection: {
      filename: resolve(__dirname, "..", ".tmp", "data.db"),
    },
    useNullAsDefault: true,
  },
});
