const PDFServicesSdk = require('@adobe/pdfservices-node-sdk');

// Initial setup, create credentials instance.
const credentials = PDFServicesSdk.Credentials
  .serviceAccountCredentialsBuilder()
  .fromFile(__dirname + '/adobe_credentials.json')
  .build();

const clientConfig = PDFServicesSdk.ClientConfig
  .clientConfigBuilder()
  .withConnectTimeout(30000)
  .withReadTimeout(60000)
  .build();

// Create an ExecutionContext using credentials
const executionContext = PDFServicesSdk.ExecutionContext.create(credentials, clientConfig);

// Build extractPDF options
const options = new PDFServicesSdk.ExtractPDF.options.ExtractPdfOptions.Builder()
  .addElementsToExtract(
    PDFServicesSdk.ExtractPDF.options.ExtractElementType.TABLES
  )
  .addTableStructureFormat('csv')
  .build()

async function parsePDF(filePath) {
  console.log(`开始解析 ${filePath}`);
  try {
    // Create a new operation instance.
    const extractPDFOperation = PDFServicesSdk.ExtractPDF.Operation.createNew(),
      input = PDFServicesSdk.FileRef.createFromLocalFile(
        filePath,
        PDFServicesSdk.ExtractPDF.SupportedSourceFormat.pdf
      );

    // Set operation input from a source file.
    extractPDFOperation.setInput(input);

    // Set options
    extractPDFOperation.setOptions(options);

    //Generating a file name
    let outputFilePath = `reports/output/${filePath.split('/').pop().split('.')[0]}.zip}`;

    console.log(`提交至 Adobe 处理`);

    const result = await extractPDFOperation.execute(executionContext);
    console.log(`解析完成，保存至 ${outputFilePath}}`);

    await result.saveAsFile(outputFilePath);
  } catch (err) {
    console.log('Exception encountered while executing operation', err);
  }

}


module.exports = { parsePDF }