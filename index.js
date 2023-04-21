const { parsePDF } = require('./pdf_parser');
const promifiy = require('util').promisify;

const fs = require('fs');
const AdmZip = require('adm-zip');

let jobs = [];
fs.readdirSync('reports').forEach(async file => {
  if (file.endsWith('.pdf')) {
    jobs.push(parsePDF(`reports/${file}`));
  }
});

(async () => {
  await Promise.all(jobs);
  console.log('All PDFs parsed');

  fs.readdirSync('reports/output').forEach(async file => {
    if (file.endsWith('.zip')) {
      const zip = new AdmZip(`reports/output/${file}`);
      console.log('Extracting', file);
      
      await promifiy(zip.extractAllToAsync)(`reports/output/${file.split('.')[0]}`, true);
    }
  });
})();
