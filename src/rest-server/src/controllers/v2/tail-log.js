// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// module dependencies
const url = require('url')
const asyncHandler = require('@pai/middlewares/v2/asyncHandler');
const {
    BlobServiceClient,
    StorageSharedKeyCredential,
    ContainerSASPermissions,
    generateBlobSASQueryParameters,
    SASProtocol,
    ContainerClient,
  } = require('@azure/storage-blob');

const getTailLog = asyncHandler (async (req, res) => {
  const logName = req.params.logName;
  const queryString = url.parse(req.url).query

  const account = 'dshuttletestne';
  const containerClient = new ContainerClient(`https://${account}.blob.core.windows.net/pai-log?${queryString}`);
  const blobClient = containerClient.getBlobClient(logName);
  let properies;
  properies = await blobClient.getProperties();
  const offset = properies.contentLength - 16 * 1024 * 1024 < 0 ? 0 : properies.contentLength - 16 * 1024 * 1024;
  const buffer = await blobClient.downloadToBuffer(offset, properies.contentLength - offset);
  res.status(206).send(buffer);
});

// module exports
module.exports = { getTailLog };
