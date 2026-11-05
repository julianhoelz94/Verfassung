package com.constitutionatlas.platform

import java.util.UUID

/** Exact snapshot citations open the owning reader directly, without a redirect page. */
fun readerPassageHref(countryCode: String?, jurisdictionId: UUID?, versionId: UUID, occurrenceId: UUID): String? {
    val reader = when {
        countryCode?.matches(Regex("[A-Za-z]{2}")) == true -> "/countries/${countryCode.uppercase()}/versions/$versionId"
        jurisdictionId != null -> "/jurisdictions/$jurisdictionId/versions/$versionId"
        else -> return null
    }
    return "$reader#$occurrenceId"
}
