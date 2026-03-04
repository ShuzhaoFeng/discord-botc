export interface LocalizedString {
  en: string;
  zh: string;
}

export interface RoleDefinition {
  id: string;
  name: LocalizedString;
  guide: LocalizedString;
}
