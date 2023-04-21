const PDFServicesSdk = require('@adobe/pdfservices-node-sdk');
const path = require('path');
const AdmZip = require('adm-zip');
const chalk = require('chalk');
const promisify = require('util').promisify;
const fs = require('fs');

const credentials = PDFServicesSdk.Credentials
  .serviceAccountCredentialsBuilder()
  .fromFile(path.resolve(__dirname, '../adobe_credentials.json'))
  .build();

const clientConfig = PDFServicesSdk.ClientConfig
  .clientConfigBuilder()
  .withConnectTimeout(30000)
  .withReadTimeout(60000)
  .build();

const executionContext = PDFServicesSdk.ExecutionContext.create(credentials, clientConfig);
const options = new PDFServicesSdk.ExtractPDF.options.ExtractPdfOptions.Builder()
  .addElementsToExtract(
    PDFServicesSdk.ExtractPDF.options.ExtractElementType.TABLES
  )
  .addTableStructureFormat('csv')
  .build()

async function parsePDFByAdobe(filePath) {
  const outputFilePath = filePath.replace('.pdf', '.zip');
  const extractDir = outputFilePath.split('.')[0];

  if (fs.existsSync(extractDir)) {
    console.log(chalk.dim(`已经解析过 ${filePath}，跳过`));
    return;
  }
  
  console.log(`开始解析 ${filePath}`);
  try {
    const extractPDFOperation = PDFServicesSdk.ExtractPDF.Operation.createNew(),
      input = PDFServicesSdk.FileRef.createFromLocalFile(
        filePath,
        PDFServicesSdk.ExtractPDF.SupportedSourceFormat.pdf
      );

    extractPDFOperation.setInput(input);
    extractPDFOperation.setOptions(options);

    console.log(`提交至 Adobe 处理`);
    const result = await extractPDFOperation.execute(executionContext);
    console.log(`解析完成，保存至 ${outputFilePath}}`);

    await result.saveAsFile(outputFilePath);
    const zip = new AdmZip(outputFilePath);
    console.log('解压', outputFilePath);
    await promisify(zip.extractAllToAsync)(extractDir, true);
  } catch (err) {
    console.log('提交 Adobe 解析 PDF 出错', err);
  }
}

async function preProcessPDFsToTable(pdfs) {
  console.log(chalk.bgWhite('开始解析报告'));
  console.log(chalk.bgWhite(`共有 ${pdfs.length} 份报告`));

  return Promise.all(pdfs.map(pdf => parsePDFByAdobe(pdf)));
}

module.exports = { preProcessPDFsToTable }