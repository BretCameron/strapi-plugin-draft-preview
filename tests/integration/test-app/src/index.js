"use strict";

const PUBLIC_ACTIONS = [
  "api::article.article.find",
  "api::article.article.findOne",
  "api::section.section.find",
  "api::section.section.findOne",
];

module.exports = {
  register() {
    // No-op. Public permissions are set in bootstrap once content types
    // are registered.
  },

  async bootstrap({ strapi }) {
    const publicRole = await strapi.db
      .query("plugin::users-permissions.role")
      .findOne({ where: { type: "public" } });

    if (!publicRole) {
      strapi.log.warn("[test-app] Public role not found; skipping permission setup");
      return;
    }

    for (const action of PUBLIC_ACTIONS) {
      const existing = await strapi.db
        .query("plugin::users-permissions.permission")
        .findOne({ where: { role: publicRole.id, action } });

      if (!existing) {
        await strapi.db
          .query("plugin::users-permissions.permission")
          .create({ data: { role: publicRole.id, action } });
      }
    }
  },
};
