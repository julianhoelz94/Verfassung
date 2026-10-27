package com.constitutionatlas.platform

import tools.jackson.databind.JsonNode

/** Scalar coercion used by existing tree-based wire contracts; objects and arrays are not text. */
fun JsonNode.scalarText(): String = if (isNull) "null" else asString("")
