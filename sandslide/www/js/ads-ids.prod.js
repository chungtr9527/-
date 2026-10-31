// PRODUCTION ad unit ids. Paste the real ids from the AdMob console here (and the App ID into
// android/app/src/main/res/values/strings.xml). The release workflow refuses to build while any
// value still contains REPLACE.
(function (g) {
  var TB = g.TB || (g.TB = {});
  TB.ADS_IDS_PROD = {
    android: {
      banner: 'ca-app-pub-REPLACE/REPLACE',
      interstitial: 'ca-app-pub-REPLACE/REPLACE',
      rwRescue: 'ca-app-pub-REPLACE/REPLACE',
      rwTilt: 'ca-app-pub-REPLACE/REPLACE'
    },
    ios: {
      banner: 'ca-app-pub-REPLACE/REPLACE',
      interstitial: 'ca-app-pub-REPLACE/REPLACE',
      rwRescue: 'ca-app-pub-REPLACE/REPLACE',
      rwTilt: 'ca-app-pub-REPLACE/REPLACE'
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
