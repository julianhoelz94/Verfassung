plugins {
  kotlin("jvm") version "2.4.21"
  kotlin("plugin.spring") version "2.4.21"
  id("io.spring.dependency-management") version "1.1.7"
  id("com.diffplug.spotless") version "8.10.4"
}

apply(from = rootDir.resolve("../../gradle/coverage-conventions.gradle"))

extra["kotlin.version"] = kotlin.coreLibrariesVersion

group = "com.constitutionatlas"
version = "0.1.0"

java {
  toolchain {
    languageVersion = JavaLanguageVersion.of(21)
  }
}

repositories {
  mavenCentral()
}

dependencyManagement {
  imports {
    mavenBom("org.springframework.boot:spring-boot-dependencies:4.1.2") {
      bomProperty("kotlin.version", kotlin.coreLibrariesVersion)
    }
  }
}

spotless {
  kotlin {
    target("src/**/*.kt")
    ktlint("1.3.1").editorConfigOverride(
      mapOf(
        "ktlint_standard_filename" to "disabled",
        "ktlint_standard_package-name" to "disabled",
      ),
    )
  }
}

dependencies {
  implementation("org.springframework.boot:spring-boot-starter-webmvc")
  implementation("tools.jackson.module:jackson-module-kotlin")
  implementation("org.jetbrains.kotlin:kotlin-reflect")
  testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<Test>().configureEach {
  useJUnitPlatform()
}
