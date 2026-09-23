export const PROFILE_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export type ProfileImageMimeType = typeof PROFILE_IMAGE_MIME_TYPES[number];

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const EXTENSION_BY_MIME: Record<ProfileImageMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function hasPrefix(bytes: Uint8Array, expected: number[]) {
  return expected.every((value, index) => bytes[index] === value);
}

function hasProfileImageSignature(bytes: Uint8Array, type: ProfileImageMimeType) {
  if (type === "image/jpeg") return hasPrefix(bytes, [0xff, 0xd8, 0xff]);
  if (type === "image/png") return hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (type === "image/webp") return hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" && ["avif", "avis", "mif1"].includes(String.fromCharCode(...bytes.slice(8, 12)));
}

export async function validateProfileImage(file: File): Promise<ProfileImageMimeType> {
  if (!PROFILE_IMAGE_MIME_TYPES.includes(file.type as ProfileImageMimeType)) {
    throw new Error("프로필 이미지는 JPG, PNG, WebP, AVIF 형식만 사용할 수 있습니다. GIF와 SVG는 지원하지 않습니다.");
  }
  if (file.size === 0 || file.size > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error("프로필 이미지는 5MB 이하만 사용할 수 있습니다.");
  }
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!hasProfileImageSignature(bytes, file.type as ProfileImageMimeType)) {
    throw new Error("이미지 파일 형식을 확인할 수 없습니다.");
  }
  return file.type as ProfileImageMimeType;
}

export async function prepareProfileImage(file: File) {
  const type = await validateProfileImage(file);
  return { type, extension: EXTENSION_BY_MIME[type] };
}
