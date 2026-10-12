import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultUploadDirectory = path.resolve(moduleDirectory, '../../../uploads/appointment-requirements');
const uploadDirectory = path.resolve(process.env.APPOINTMENT_UPLOAD_DIR || defaultUploadDirectory);
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const fileExtensionsByMime = new Map([
  ['application/pdf', new Set(['.pdf'])],
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])],
  ['image/webp', new Set(['.webp'])],
]);

export const isValidAppointmentFileId = value =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const getAppointmentUploadPath = fileId => {
  if (!isValidAppointmentFileId(fileId)) {
    throw Object.assign(new Error('Invalid appointment file.'), { statusCode: 404 });
  }
  return path.join(uploadDirectory, fileId);
};

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    mkdir(uploadDirectory, { recursive: true })
      .then(() => callback(null, uploadDirectory))
      .catch(callback);
  },
  filename: (_request, _file, callback) => callback(null, randomUUID()),
});

export const uploadRequirementFiles = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 20, fields: 20, parts: 40 },
  fileFilter: (_request, file, callback) => {
    const allowedExtensions = fileExtensionsByMime.get(file.mimetype);
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions?.has(extension)) {
      return callback(Object.assign(
        new Error('Upload a PDF, JPG, PNG, or WebP file.'),
        { statusCode: 400 },
      ));
    }
    return callback(null, true);
  },
}).any();

export const removeUploadedFiles = async files => {
  await Promise.all((files || []).map(async file => {
    try {
      await unlink(file.path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }));
};

export const removeAppointmentFiles = async intakeData => {
  const fileIds = Object.values(intakeData || {})
    .map(value => value?.fileId)
    .filter(isValidAppointmentFileId);
  await Promise.all(fileIds.map(async fileId => {
    try {
      await unlink(getAppointmentUploadPath(fileId));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }));
};
