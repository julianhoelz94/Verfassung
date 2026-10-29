export const swaggerMessages = {
  title: { en: 'API documentation', de: 'API-Dokumentation' },
  enabled: { en: 'Allow public Swagger UI access', de: 'Öffentlichen Zugriff auf Swagger UI erlauben' },
  description: {
    en: 'Show Swagger links on About and allow anyone to view the API documentation. Turn this off to hide the links and block Swagger pages. Protected API operations still require authorization.',
    de: 'Swagger-Links auf der Seite „Über“ anzeigen und die API-Dokumentation öffentlich zugänglich machen. Deaktivieren Sie diese Option, um die Links auszublenden und Swagger-Seiten zu sperren. Geschützte API-Aufrufe erfordern weiterhin eine Berechtigung.',
  },
  save: { en: 'Save API documentation settings', de: 'API-Dokumentationseinstellungen speichern' },
  unavailable: { en: 'API documentation settings could not be loaded. Try again later.', de: 'Die API-Dokumentationseinstellungen konnten nicht geladen werden. Versuchen Sie es später erneut.' },
} as const;
