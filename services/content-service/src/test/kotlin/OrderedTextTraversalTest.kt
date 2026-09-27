import com.constitutionatlas.platform.OrderedContentText
import com.constitutionatlas.platform.OrderedEntry
import com.constitutionatlas.platform.OrderedNode
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class OrderedTextTraversalTest {
    @Test
    fun childBoundariesAndTextSplitsPreserveStoredWhitespace() {
        val child = OrderedNode(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "sentence", "(2a)", "Metadata", listOf(OrderedEntry("text", text = "inside.\n")))
        assertThat(OrderedContentText.entries(listOf(OrderedEntry("text", text = "before  "), OrderedEntry("child", node = child), OrderedEntry("text", text = "after")))).isEqualTo("before  inside.\nafter")
        assertThat(OrderedContentText.entries(listOf(OrderedEntry("text", text = "un"), OrderedEntry("text", text = "broken")))).isEqualTo("unbroken")
        assertThat(OrderedContentText.entries(listOf(OrderedEntry("child", node = child.copy(content = listOf(OrderedEntry("text", text = "First.")))), OrderedEntry("child", node = child.copy(content = listOf(OrderedEntry("text", text = "Second."))))))).isEqualTo("First. Second.")
    }
}
