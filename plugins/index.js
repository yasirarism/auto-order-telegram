const { createSharedContext } = require("./shared");

module.exports = function registerAllPlugins(baseScope) {
  const scope = createSharedContext(baseScope);

  require("./product-messages")(scope);
  require("./start")(scope);
  require("./menu")(scope);
  require("./catalog")(scope.bot, scope);
  require("./transactions")(scope);
  require("./admin-products")(scope);
  require("./admin-stock")(scope);
  require("./terms")(scope);
  require("./admin-system")(scope);
  require("./admin-reports")(scope);
  require("./order-flow")(scope);
  require("./qris")(scope);
  require("./system")(scope);
};
