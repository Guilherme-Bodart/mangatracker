import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

const GIF_EXTENSIONS = new Set(['.gif']);
const ALWAYS_BLOCKED_EXTENSIONS = new Set([
  '.apng',
  '.webm',
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
]);

function getExtensionFlags(value: string): {
  isGif: boolean;
  isAlwaysBlocked: boolean;
} {
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.toLowerCase();
    let isGif = false;
    let isAlwaysBlocked = false;

    for (const ext of GIF_EXTENSIONS) {
      if (pathname.endsWith(ext)) {
        isGif = true;
        break;
      }
    }

    for (const ext of ALWAYS_BLOCKED_EXTENSIONS) {
      if (pathname.endsWith(ext)) {
        isAlwaysBlocked = true;
        break;
      }
    }

    // Defensive checks for providers that expose format via query string.
    const formatParam = parsed.searchParams.get('format')?.toLowerCase();
    if (formatParam) {
      if (GIF_EXTENSIONS.has(`.${formatParam}`)) {
        isGif = true;
      }

      if (ALWAYS_BLOCKED_EXTENSIONS.has(`.${formatParam}`)) {
        isAlwaysBlocked = true;
      }
    }

    return { isGif, isAlwaysBlocked };
  } catch {
    // URL shape is validated by @IsUrl, not by this validator.
    return { isGif: false, isAlwaysBlocked: false };
  }
}

type StaticImageUrlOptions = {
  validationOptions?: ValidationOptions;
  allowAnimatedEnvVar?: string;
};

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export function IsStaticImageUrl(options?: StaticImageUrlOptions) {
  const envVarName = options?.allowAnimatedEnvVar ?? 'ALLOW_ANIMATED_IMAGES';

  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStaticImageUrl',
      target: object.constructor,
      propertyName,
      options: options?.validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null || value === '') {
            return true;
          }

          if (typeof value !== 'string') {
            return false;
          }

          const { isGif, isAlwaysBlocked } = getExtensionFlags(value);
          if (isAlwaysBlocked) {
            return false;
          }

          if (isGif) {
            return isTruthy(process.env[envVarName]);
          }

          return true;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a static image URL (set ${envVarName}=true to allow GIF only)`;
        },
      },
    });
  };
}
