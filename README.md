A toy app to analyze health report and ask questions, powered by [Adobe PDF Services](https://developer.adobe.com/document-services/docs/apis/#tag/Extract-PDF/operation/pdfoperations.extractpdf) and [OpenAI API](https://platform.openai.com/docs/api-reference).

![](https://mdn.alipayobjects.com/huamei_fo0oo6/afts/img/A*M1SERYfju1gAAAAAAAAAAAAADtR_AQ/original)

## Use by your own

```bash
> OPENAI_API_KEY=sk-xxxxx_YOUR_KEY_HERE node index.js
```

If you're not able to connect with OpenAI endpoint and have your own proxy, use

```bash
> OPENAI_BASE_PATH=https://yourdomain.com/v1 node index.js
```

## Using Adobe PDF Services

Generate your own `adobe_credentials.json` and `private.key`, put it in the root directory in the project, and modify `PARSE_MODE` in index.js to `"adobe"`.