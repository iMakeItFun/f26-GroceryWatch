const appJson = require("./app.json");
const plugins = [...(appJson.expo.plugins ?? [])];

if (process.env.GOOGLE_MAPS_API_KEY) {
  plugins.push([
    "react-native-maps",
    { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY },
  ]);
}

module.exports = {
  ...appJson,
  expo: {
    ...appJson.expo,
    plugins,
  },
};
