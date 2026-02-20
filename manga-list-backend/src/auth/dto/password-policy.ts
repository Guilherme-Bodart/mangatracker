import { IsString, Matches, MinLength } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 10 characters and include uppercase, lowercase, and a number';

export function ApplyPasswordPolicy(): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    IsString()(target, propertyKey as string);
    MinLength(PASSWORD_MIN_LENGTH, {
      message: PASSWORD_POLICY_MESSAGE,
    })(target, propertyKey as string);
    Matches(PASSWORD_COMPLEXITY_REGEX, {
      message: PASSWORD_POLICY_MESSAGE,
    })(target, propertyKey as string);
  };
}
