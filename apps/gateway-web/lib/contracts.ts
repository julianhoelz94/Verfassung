import type {
  ArticleDetail,
  ArticleSummary,
  CountryDetail,
  CountrySummary,
} from './api';
import catalogCountries from './contracts/catalog-countries.json';
import catalogCountryDe from './contracts/catalog-country-DE.json';
import contentArticle from './contracts/content-article.json';
import contentArticles from './contracts/content-articles.json';

/** Gateway consumer contracts for CAT-2 / CNT-2 JSON shapes (QLT-3). */
export const catalogCountriesContract: CountrySummary[] = catalogCountries;
export const catalogCountryDetailContract: CountryDetail = catalogCountryDe;
export const contentArticleListContract: ArticleSummary[] = contentArticles;
export const contentArticleDetailContract: ArticleDetail = contentArticle;
