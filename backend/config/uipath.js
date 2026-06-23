require('dotenv').config();

module.exports = {
  clientId: process.env.UIPATH_CLIENT_ID,
  clientSecret: process.env.UIPATH_CLIENT_SECRET,
  tenantName: process.env.UIPATH_TENANT_NAME,
  organizationId: process.env.UIPATH_ORGANIZATION_ID,
};
