package com.constitutionatlas.content.service

import com.constitutionatlas.content.api.ContentNodeDto

internal object ContentTrees {
    fun flattenText(nodes: List<ContentNodeDto>): String = flatten(nodes, { it.body }, { it.children })

    private fun <T> flatten(
        nodes: List<T>,
        body: (T) -> String?,
        children: (T) -> List<T>,
    ): String = nodes.flatMap { collect(it, body, children) }.joinToString(" ")

    private fun <T> collect(
        node: T,
        body: (T) -> String?,
        children: (T) -> List<T>,
    ): List<String> {
        val own = body(node)?.trim()?.takeIf { it.isNotEmpty() }
        return listOfNotNull(own) + children(node).flatMap { collect(it, body, children) }
    }
}
