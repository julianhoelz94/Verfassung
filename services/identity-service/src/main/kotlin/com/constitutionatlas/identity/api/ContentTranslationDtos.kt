package com.constitutionatlas.identity.api

data class ContentTranslationSiteDto(
    val provider: String,
    val sharedKeyConfigured: Boolean,
    val sharedGoogleCharactersUsed: Int,
    val sharedGoogleCharacterLimit: Int = 500_000,
)

data class UpdateContentTranslationSiteRequest(
    val provider: String,
    val sharedApiKey: String? = null,
    val clearSharedApiKey: Boolean = false,
)

data class ContentTranslationUserDto(
    val alwaysTranslate: Boolean,
    val personalGoogleKeyConfigured: Boolean,
)

data class UpdateContentTranslationUserRequest(
    val alwaysTranslate: Boolean,
    val personalGoogleKey: String? = null,
    val clearPersonalGoogleKey: Boolean = false,
)

data class TranslateContentRequest(
    val text: String,
    val sourceLanguage: String,
    val targetLanguage: String,
)

data class TranslateContentResponse(val text: String, val provider: String)

data class TranslateContentBatchRequest(
    val texts: List<String>,
    val sourceLanguage: String,
    val targetLanguage: String,
)

data class TranslateContentBatchResponse(val texts: List<String>, val provider: String)
