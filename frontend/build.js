const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ELM_019_BIN = 'elm';
const OUTPUT_DIR = 'build';
const BUNDLE_FILENAME = 'bundle';
const BUNDLE_FILEPATH = OUTPUT_DIR + '/' + BUNDLE_FILENAME + '.js';
const ENV_PRODUCTION = 'production';
const ENV_DEVELOPMENT = 'development';

const environment =
  (process.argv[2] || '').toLowerCase() === ENV_PRODUCTION.toLowerCase()
    ? ENV_PRODUCTION
    : ENV_DEVELOPMENT;

const elmMake = (bundlePath, optimize, debug) =>
  new Promise((resolve, reject) => {
    spawn(
      ELM_019_BIN,
      ['make', 'src/Main.elm', '--output=' + bundlePath]
        .concat(optimize ? ['--optimize'] : [])
        .concat(debug ? ['--debug'] : []),
      {
        stdio: 'inherit'
      }
    ).on('exit', error => {
      if (error) return reject('');

      resolve(bundlePath);
    });
  });

const minifyCode = bundlePath => {
  const UglifyJS = require('uglify-js');
  const code = fs.readFileSync(bundlePath, 'utf8');
  const result = UglifyJS.minify(code, {
    compress: {
      warnings: false
    },
    output: {
      comments: false,
      ascii_only: true
    }
  });

  if (result.error) throw new Error(result.error);

  const codeHash = require('crypto')
    .createHash('md5')
    .update(result.code)
    .digest('hex');

  const bundleWithHashPath = bundlePath.replace(
    /\.js$/,
    '-' + codeHash + '.js'
  );

  fs.writeFileSync(bundleWithHashPath, result.code, 'utf8');

  return bundleWithHashPath;
};

const createIndexHtml = (
  bundleFilePath,
  inIndexHtmlFilePath,
  outIndexHtmlFilePath
) => {
  const indexContentWithBundleScript = fs
    .readFileSync(inIndexHtmlFilePath, 'utf8')
    .replace(
      '</head>',
      '    <script src="' +
        path.basename(bundleFilePath) +
        '"></script>\n</head>'
    );

  fs.writeFileSync(outIndexHtmlFilePath, indexContentWithBundleScript, 'utf8');
};

const removeOldBundleFiles = latestBundlePath => {
  const relativeBundleFilename = path.basename(latestBundlePath);

  fs.readdirSync(OUTPUT_DIR)
    .filter(
      filename =>
        filename.startsWith(BUNDLE_FILENAME) &&
        filename !== relativeBundleFilename
    )
    .forEach(filename => fs.unlinkSync(OUTPUT_DIR + '/' + filename));
};

console.log('Building for environment', environment);

elmMake(
  BUNDLE_FILEPATH,
  environment === ENV_PRODUCTION,
  environment === ENV_DEVELOPMENT
)
  .then(bundlePath => {
    const pathToBundle =
      environment === ENV_PRODUCTION ? minifyCode(bundlePath) : bundlePath;

    createIndexHtml(pathToBundle, 'src/index.html', OUTPUT_DIR + '/index.html');

    fs.copyFileSync('src/index.js', OUTPUT_DIR + '/index.js');
    fs.copyFileSync('src/index.css', OUTPUT_DIR + '/index.css');
    fs.copyFileSync('src/iconPower.svg', OUTPUT_DIR + '/iconPower.svg');
    fs.copyFileSync('src/iconPlus.svg', OUTPUT_DIR + '/iconPlus.svg');
    fs.copyFileSync('src/iconMinus.svg', OUTPUT_DIR + '/iconMinus.svg');
    fs.copyFileSync(
      'src/apple_splash_640.png',
      OUTPUT_DIR + '/apple_splash_640.png'
    );
    fs.copyFileSync(
      'src/apple_splash_750.png',
      OUTPUT_DIR + '/apple_splash_750.png'
    );

    removeOldBundleFiles(pathToBundle);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
