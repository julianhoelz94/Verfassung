plugins {
  kotlin("jvm") version "1.9.24"
  kotlin("plugin.spring") version "1.9.24"
  id("io.spring.dependency-management") version "1.1.7"
  id("com.diffplug.spotless") version "6.25.0"
}

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
    mavenBom("org.springframework.boot:spring-boot-dependencies:3.5.16")
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
  implementation("org.springframework.boot:spring-boot-starter-web")
  implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
  implementation("org.jetbrains.kotlin:kotlin-reflect")
}

tasks.withType<Test>().configureEach {
  useJUnitPlatform()
}
