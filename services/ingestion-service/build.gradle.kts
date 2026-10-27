plugins {
  kotlin("jvm") version "2.4.21"
  kotlin("plugin.spring") version "2.4.21"
  id("org.springframework.boot") version "4.1.2"
  id("io.spring.dependency-management") version "1.1.7"
  id("com.diffplug.spotless") version "8.10.4"
}

apply(
    from =
        listOf(
            rootDir.resolve("gradle/service-conventions.gradle"),
            rootDir.resolve("../../gradle/service-conventions.gradle"),
        ).first { it.isFile },
)

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

dependencies {
  implementation("com.constitutionatlas:platform:0.1.0")
  implementation("org.springframework.boot:spring-boot-starter-webmvc")
  implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:3.2.0")
  implementation("org.springframework.boot:spring-boot-starter-actuator")
  implementation("org.springframework.boot:spring-boot-starter-validation")
  implementation("org.springframework.boot:spring-boot-starter-data-jdbc")
  implementation("tools.jackson.module:jackson-module-kotlin")
  implementation("org.jetbrains.kotlin:kotlin-reflect")
  runtimeOnly("org.postgresql:postgresql")
  implementation("org.springframework.boot:spring-boot-starter-flyway")
  implementation("org.flywaydb:flyway-database-postgresql")

  testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
  testImplementation("org.testcontainers:testcontainers-junit-jupiter")
  testImplementation("org.testcontainers:testcontainers-postgresql")
}
