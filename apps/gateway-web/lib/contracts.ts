import type {
  ArticleDetail,
  ArticleSummary,
  CountryDetail,
  CountrySummary,
  SearchFacets,
  SearchPage,
} from './api';
import catalogCountries from './contracts/catalog-countries.json';
import catalogCountryDe from './contracts/catalog-country-DE.json';
import contentArticle from './contracts/content-article.json';
import contentArticles from './contracts/content-articles.json';
import searchFacets from './contracts/search-facets.json';
import searchPage from './contracts/search-page.json';

/** Gateway consumer contracts for CAT-2 / CNT-2 JSON shapes (QLT-3). */
export const catalogCountriesContract: CountrySummary[] = catalogCountries;
export const catalogCountryDetailContract: CountryDetail = catalogCountryDe;
export const contentArticleListContract: ArticleSummary[] = contentArticles;
export const contentArticleDetailContract: ArticleDetail = contentArticle;
export const searchPageContract: SearchPage = searchPage;
export const searchFacetsContract: SearchFacets = searchFacets;
export { default as identityMeContract } from './contracts/identity-me.json';
export { default as identityErrorContract } from './contracts/identity-error.json';
