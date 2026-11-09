FROM eclipse-temurin:25-jre
WORKDIR /app
COPY build/libs/app.jar app.jar
EXPOSE 8080
# Non-root runtime; /tmp stays writable for the JVM.
USER 65532:65532
ENTRYPOINT ["java","-jar","/app/app.jar"]
