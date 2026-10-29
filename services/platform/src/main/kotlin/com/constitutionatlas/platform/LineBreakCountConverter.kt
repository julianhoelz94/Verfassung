package com.constitutionatlas.platform

import tools.jackson.databind.JsonNode
import tools.jackson.databind.util.StdConverter

/** This new metadata field is strict without changing historical text/number coercion. */
class LineBreakCountConverter : StdConverter<JsonNode, Int>() {
    override fun convert(value: JsonNode): Int {
        require(value.isIntegralNumber && value.canConvertToInt()) { "lineBreaksBefore must be a JSON integer" }
        return value.intValue()
    }
}

/** An omitted/null replacement value retains the entry's existing separator. */
class OptionalLineBreakCountConverter : StdConverter<JsonNode, Int?>() {
    override fun convert(value: JsonNode): Int? = if (value.isNull) null else LineBreakCountConverter().convert(value)
}
