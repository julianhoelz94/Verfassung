# syntax=docker/dockerfile:1
# Local source build; CI can still package its tested JARs with services/*/Dockerfile.
FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace
COPY --chmod=755 gradlew ./gradlew
COPY gradle ./gradle
COPY services/platform ./services/platform
ARG SERVICE
COPY services/${SERVICE} ./services/${SERVICE}
# One Gradle worker, no project parallelism or separate Kotlin daemon. The locked
# cache is shared across images; source and outputs live only in the Linux builder.
RUN --mount=type=cache,id=atlas-local-gradle,target=/root/.gradle,sharing=locked \
    ./gradlew --no-daemon --console=plain --max-workers=1 --no-parallel \
      -Pkotlin.compiler.execution.strategy=in-process \
      -p services/${SERVICE} bootJar -x test && \
    cp services/${SERVICE}/build/libs/app.jar /workspace/app.jar

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build --chmod=644 /workspace/app.jar app.jar
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
