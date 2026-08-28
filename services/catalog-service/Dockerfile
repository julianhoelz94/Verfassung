FROM gradle:9.7-jdk21 AS build
WORKDIR /workspace
COPY build.gradle.kts settings.gradle.kts ./
RUN gradle --no-daemon -Dorg.gradle.jvmargs="-Xms128m -Xmx384m" dependencies || true
COPY src ./src
RUN gradle --no-daemon -Dorg.gradle.jvmargs="-Xms128m -Xmx384m" bootJar -x test

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]

