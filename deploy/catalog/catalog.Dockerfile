FROM registry.redhat.io/openshift4/ose-operator-registry-rhel9:v4.18
COPY fbc /configs
ENTRYPOINT ["/bin/opm"]
CMD ["serve", "/configs", "--cache-dir=/tmp/cache"]
