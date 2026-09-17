export const MAX_UPLOAD_SIZE_BYTES = 30 * 1024 * 1024;

export const SUPPORTED_UPLOAD_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export function getUploadAcceptAttribute() {
  return ".pdf,.jpg,.jpeg,.png,.docx";
}

export function validatePolicyFile(file: File): string | null {
  const extension = file.name.toLowerCase().split(".").pop();
  const validExtension = extension && ["pdf", "jpg", "jpeg", "png", "docx"].includes(extension);
  if (!SUPPORTED_UPLOAD_TYPES.includes(file.type as typeof SUPPORTED_UPLOAD_TYPES[number]) && !validExtension) {
    return "Please choose a PDF, JPG, PNG, or DOCX file.";
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return "This file is larger than the 30 MB limit.";
  }

  return null;
}

export const validatePolicyPdf = validatePolicyFile;
